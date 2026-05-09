"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, RefreshCw, Search } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { DataTableShell, DetailPanel, KpiCard, QuickActionGrid } from "@/components/ui/operations";
import { apiFetch, toArray } from "@/lib/api";
import { downloadCsv } from "@/lib/export/csv";

type ProductRow = {
  id: number;
  name: string;
  product_code?: string | null;
  sku?: string | null;
  unit_of_measure?: string | null;
  inventory_profile_id?: number | null;
  inventory_ready?: boolean;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  base_price: string;
  image?: string | null;
  created_at?: string | null;
  // Phase 2
  lifecycle_status?: string | null;
  is_direct_sale_enabled?: boolean;
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
};

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load product register.";
}

function truncate(value: string | null | undefined, length = 90): string {
  const text = (value || "").trim();
  if (!text) return "—";
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1)}…`;
}

function normalizeLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = (value || "").trim();
  return trimmed || fallback;
}

function normalizeProductRow(raw: Record<string, unknown>): ProductRow {
  return {
    id: toNumber(raw.id),
    name: toStringValue(raw.name) || "Unnamed product",
    product_code: toNullableString(raw.product_code) ?? toNullableString(raw.code),
    sku: toNullableString(raw.sku),
    unit_of_measure: toNullableString(raw.unit_of_measure),
    inventory_profile_id:
      typeof raw.inventory_profile_id === "number"
        ? raw.inventory_profile_id
        : raw.inventory_profile_id === null
          ? null
          : undefined,
    inventory_ready: typeof raw.inventory_ready === "boolean" ? raw.inventory_ready : false,
    lifecycle_status: toNullableString(raw.lifecycle_status) ?? "ACTIVE",
    is_direct_sale_enabled: typeof raw.is_direct_sale_enabled === "boolean" ? raw.is_direct_sale_enabled : true,
    is_emi_enabled: typeof raw.is_emi_enabled === "boolean" ? raw.is_emi_enabled : undefined,
    is_rent_enabled: typeof raw.is_rent_enabled === "boolean" ? raw.is_rent_enabled : undefined,
    is_lease_enabled: typeof raw.is_lease_enabled === "boolean" ? raw.is_lease_enabled : undefined,
    category: toNullableString(raw.category),
    subcategory: toNullableString(raw.subcategory) ?? toNullableString(raw.sub_category),
    description: toNullableString(raw.description),
    base_price: toMoneyString(raw.base_price ?? raw.price ?? raw.total_amount),
    image: toNullableString(raw.image) ?? toNullableString(raw.image_url),
    created_at: toNullableString(raw.created_at),
  };
}

function extractRowsAndNext(payload: unknown): {
  rows: Record<string, unknown>[];
  nextPath: string | null;
} {
  const objectPayload = toObject(payload);

  if (objectPayload && Array.isArray(objectPayload.results)) {
    const nextRaw = objectPayload.next;
    return {
      rows: toArray<Record<string, unknown>>(objectPayload.results),
      nextPath: typeof nextRaw === "string" && nextRaw.trim() ? nextRaw : null,
    };
  }

  return {
    rows: toArray<Record<string, unknown>>(payload),
    nextPath: null,
  };
}

function normalizeApiPath(nextPath: string): string {
  const trimmed = nextPath.trim();

  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const parsed = new URL(trimmed);
    const combined = `${parsed.pathname}${parsed.search}`;
    if (combined.startsWith("/api/v1/")) {
      return combined.replace(/^\/api\/v1/, "");
    }
    return combined;
  }

  if (trimmed.startsWith("/api/v1/")) {
    return trimmed.replace(/^\/api\/v1/, "");
  }

  return trimmed;
}

async function fetchAllProducts(filters: {
  q?: string;
  category?: string;
  subcategory?: string;
}): Promise<ProductRow[]> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.subcategory) params.set("subcategory", filters.subcategory);

  let nextPath: string | null = `/admin/products/${params.toString() ? `?${params.toString()}` : ""}`;
  const collected: ProductRow[] = [];
  const seen = new Set<number>();

  for (let guard = 0; nextPath && guard < 100; guard += 1) {
    const payload = await apiFetch<unknown>(nextPath);
    const { rows, nextPath: rawNext } = extractRowsAndNext(payload);

    for (const raw of rows) {
      const normalized = normalizeProductRow(raw);
      if (!seen.has(normalized.id)) {
        seen.add(normalized.id);
        collected.push(normalized);
      }
    }

    nextPath = rawNext ? normalizeApiPath(rawNext) : null;
  }

  return collected;
}

export default function AdminProductsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamKey = searchParams.toString();

  const initialQuery = (searchParams.get("q") || "").trim();
  const initialCategory = (searchParams.get("category") || "").trim();
  const initialSubcategory = (searchParams.get("subcategory") || "").trim();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queryInput, setQueryInput] = useState(initialQuery);
  const [categoryInput, setCategoryInput] = useState(initialCategory);
  const [subcategoryInput, setSubcategoryInput] = useState(initialSubcategory);

  const [query, setQuery] = useState(initialQuery);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [subcategoryFilter, setSubcategoryFilter] = useState(initialSubcategory);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await fetchAllProducts({
          q: query || undefined,
          category: categoryFilter || undefined,
          subcategory: subcategoryFilter || undefined,
        });
        setRows(payload);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") setRows([]);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [categoryFilter, query, subcategoryFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamKey);
    const nextQuery = (params.get("q") || "").trim();
    const nextCategory = (params.get("category") || "").trim();
    const nextSubcategory = (params.get("subcategory") || "").trim();

    setQueryInput(nextQuery);
    setCategoryInput(nextCategory);
    setSubcategoryInput(nextSubcategory);
    setQuery(nextQuery);
    setCategoryFilter(nextCategory);
    setSubcategoryFilter(nextSubcategory);
  }, [searchParamKey]);

  function replaceFilters(params: URLSearchParams) {
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const nextQuery = queryInput.trim();
    const nextCategory = categoryInput.trim();
    const nextSubcategory = subcategoryInput.trim();

    if (nextQuery) params.set("q", nextQuery);
    if (nextCategory) params.set("category", nextCategory);
    if (nextSubcategory) params.set("subcategory", nextSubcategory);
    replaceFilters(params);
  }

  function handleResetFilters() {
    setQueryInput("");
    setCategoryInput("");
    setSubcategoryInput("");
    replaceFilters(new URLSearchParams());
  }

  function handleCategoryShortcut(nextCategory: string, nextSubcategory = "") {
    const params = new URLSearchParams();
    if (queryInput.trim()) params.set("q", queryInput.trim());
    if (nextCategory) params.set("category", nextCategory);
    if (nextSubcategory) params.set("subcategory", nextSubcategory);
    replaceFilters(params);
  }

  const distinctCategories = useMemo(
    () =>
      new Set(
        rows
          .map((row) => normalizeLabel(row.category, "Uncategorized"))
          .filter(Boolean)
      ).size,
    [rows]
  );

  const imageCount = useMemo(
    () => rows.filter((row) => Boolean((row.image || "").trim())).length,
    [rows]
  );
  const inventoryReadyCount = useMemo(
    () => rows.filter((row) => row.inventory_ready).length,
    [rows]
  );

  const visibleBaseValue = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.base_price || 0), 0),
    [rows]
  );

  const uncategorizedCount = useMemo(
    () => rows.filter((row) => !row.category && !row.subcategory).length,
    [rows]
  );

  const imageCoverage = rows.length > 0 ? Math.round((imageCount / rows.length) * 100) : 0;

  const categoryHighlights = useMemo(() => {
    const grouped = new Map<string, { label: string; count: number; subcategories: Set<string> }>();

    for (const row of rows) {
      const label = normalizeLabel(row.category, "Uncategorized");
      const current = grouped.get(label) || {
        label,
        count: 0,
        subcategories: new Set<string>(),
      };
      current.count += 1;
      current.subcategories.add(normalizeLabel(row.subcategory, "Unspecified"));
      grouped.set(label, current);
    }

    return Array.from(grouped.values())
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label)))
      .slice(0, 6);
  }, [rows]);

  const subcategoryHighlights = useMemo(() => {
    if (!categoryFilter) return [];

    const grouped = new Map<string, { label: string; count: number }>();

    for (const row of rows) {
      const label = normalizeLabel(row.subcategory, "Unspecified");
      const current = grouped.get(label) || { label, count: 0 };
      current.count += 1;
      grouped.set(label, current);
    }

    return Array.from(grouped.values())
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label)))
      .slice(0, 6);
  }, [categoryFilter, rows]);

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        product_code: row.product_code ?? "",
        sku: row.sku ?? "",
        unit_of_measure: row.unit_of_measure ?? "",
        category: row.category ?? "",
        subcategory: row.subcategory ?? "",
        description: row.description ?? "",
        base_price: row.base_price,
        image_status: row.image ? "AVAILABLE" : "NOT_PROVIDED",
        created_at: row.created_at ?? "",
      })),
    [rows]
  );

  const columns = useMemo<Column<ProductRow>[]>(
    () => [
      {
        key: "name",
        title: "Product",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.product_code || `Product #${row.id}`}
            </div>
            <div className="text-xs text-muted-foreground">
              Created {formatDateTime(row.created_at)}
            </div>
          </div>
        ),
      },
      {
        key: "category",
        title: "Catalog",
        sortable: true,
        render: (row) => (
          <div className="space-y-2">
            <div className="text-sm text-foreground">
              {normalizeLabel(row.category, "Uncategorized")}
            </div>
            <StatusBadge
              status={row.subcategory ? "ASSIGNED" : "NOT_PROVIDED"}
              label={normalizeLabel(row.subcategory, "No subcategory")}
              hideIcon={!row.subcategory}
            />
          </div>
        ),
      },
      {
        key: "sku",
        title: "SKU / Unit",
        sortable: true,
        render: (row) => (
          <div className="space-y-1 text-sm text-foreground">
            <div>{row.sku || "SKU pending"}</div>
            <div className="text-xs text-muted-foreground">{row.unit_of_measure || "PCS"}</div>
          </div>
        ),
      },
      {
        key: "description",
        title: "Description",
        render: (row) => (
          <div className="max-w-md text-sm text-foreground">
            {truncate(row.description)}
          </div>
        ),
      },
      {
        key: "base_price",
        title: "Contract Price",
        align: "right",
        sortable: true,
        sortAccessor: (row) => Number(row.base_price || 0),
        render: (row) => (
          <div className="space-y-1 text-right">
            <div className="font-semibold text-foreground">{money(row.base_price)}</div>
            <div className="text-xs text-muted-foreground">Base price = contract total</div>
          </div>
        ),
      },
      {
        key: "image",
        title: "Readiness & Status",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            {/* Phase 2: lifecycle status badge */}
            {row.lifecycle_status && row.lifecycle_status !== "ACTIVE" && (
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                row.lifecycle_status === "DISCONTINUED"
                  ? "bg-red-100 text-red-800 ring-1 ring-red-200"
                  : row.lifecycle_status === "MAINTENANCE"
                  ? "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200"
                  : "bg-blue-100 text-blue-800 ring-1 ring-blue-200"
              }`}>
                {row.lifecycle_status}
              </span>
            )}
            <StatusBadge
              status={row.image ? "AVAILABLE" : "NOT_PROVIDED"}
              label={row.image ? "Image Ready" : "No Image"}
            />
            <StatusBadge
              status={row.category ? "ASSIGNED" : "PENDING"}
              label={row.category ? "Cataloged" : "Needs Catalog"}
            />
            <StatusBadge
              status={row.inventory_ready ? "AVAILABLE" : "PENDING"}
              label={row.inventory_ready ? "Inventory Ready" : "Stock Profile Pending"}
            />
          </div>
        ),
      },
    ],
    []
  );

  return (
    <PortalPage
      title="Product Register"
      subtitle="Keep contract pricing, product cataloging, and subscription-ready inventory readable for daily staff without changing the underlying Lucky Plan pricing rule."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Products" },
      ]}
      actions={[
        { href: "/admin/products/create", label: "Create Product", variant: "primary" },
        { href: "/admin/products/masters", label: "Manage Masters", variant: "secondary" },
        {
          href: "/admin/subscriptions/advance-emi/create",
          label: "Create Subscription",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Visible Products", value: rows.length },
        { label: "Categories", value: distinctCategories },
        { label: "Catalog Gaps", value: uncategorizedCount, tone: uncategorizedCount > 0 ? "warning" : undefined },
        { label: "Inventory Ready", value: inventoryReadyCount, tone: inventoryReadyCount > 0 ? "success" : undefined },
        { label: "Image Coverage", value: `${imageCoverage}%`, tone: imageCoverage < 60 ? "warning" : "success" },
      ]}
      statusBadge={{ label: "Product Operations", tone: "info" }}
    >
      <div className="space-y-6">
        <QuickActionGrid>
          <KpiCard label="Visible Products" value={rows.length} />
          <KpiCard
            label="Visible Contract Value"
            value={money(visibleBaseValue)}
            helper="Sum of base price for products in the current filter view."
          />
          <KpiCard
            label="Catalog Coverage"
            value={rows.length - uncategorizedCount}
            helper={`${uncategorizedCount} need catalog cleanup`}
          />
          <KpiCard
            label="Image Coverage"
            value={`${imageCoverage}%`}
            helper={`${imageCount}/${rows.length || 0} products with images`}
          />
        </QuickActionGrid>

        <DetailPanel
          title="Catalog workflow"
          description="Use server-backed search and catalog filters to keep product lookup fast, export the current view for offline review, manage category/subcategory/unit masters from one workspace, and route directly into product or subscription work."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              href="/admin/products/masters"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Manage Masters
            </Link>
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              disabled={exportRows.length === 0 || loading}
              onClick={() =>
                downloadCsv(
                  "product-register-current-view.csv",
                  [
                    { key: "id", header: "id" },
                    { key: "name", header: "name" },
                    { key: "product_code", header: "product_code" },
                    { key: "sku", header: "sku" },
                    { key: "unit_of_measure", header: "unit_of_measure" },
                    { key: "category", header: "category" },
                    { key: "subcategory", header: "subcategory" },
                    { key: "description", header: "description" },
                    { key: "base_price", header: "base_price" },
                    { key: "image_status", header: "image_status" },
                    { key: "created_at", header: "created_at" },
                  ],
                  exportRows
                )
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export Current View
            </button>
          </div>
          <TableToolbar
            footer={
              query || categoryFilter || subcategoryFilter ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-[0.14em]">Active filters</span>
                  {query ? <StatusBadge status="OPEN" label={`Search: ${query}`} hideIcon /> : null}
                  {categoryFilter ? <StatusBadge status="ASSIGNED" label={`Category: ${categoryFilter}`} hideIcon /> : null}
                  {subcategoryFilter ? (
                    <StatusBadge status="ASSIGNED" label={`Subcategory: ${subcategoryFilter}`} hideIcon />
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Product base price remains the total contract price. These filters only improve register usability and do not alter EMI math or downstream subscription rules.
                </div>
              )
            }
          >
            <form
              onSubmit={handleApplyFilters}
              className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]"
            >
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  placeholder="Search by name, code, SKU, or description"
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                />
              </label>

              <input
                type="text"
                value={categoryInput}
                onChange={(event) => setCategoryInput(event.target.value)}
                placeholder="Category"
                className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />

              <input
                type="text"
                value={subcategoryInput}
                onChange={(event) => setSubcategoryInput(event.target.value)}
                placeholder="Subcategory"
                className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Reset
                </button>
              </div>
            </form>
          </TableToolbar>
        </DetailPanel>

        {!loading && !error && categoryHighlights.length > 0 ? (
          <DetailPanel
            title="Catalog shortcuts"
            description="Use the heaviest categories in the current view to narrow the register with fewer clicks."
          >
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Category focus
                </div>
                <div className="flex flex-wrap gap-2">
                  {categoryHighlights.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleCategoryShortcut(item.label)}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-left text-sm transition hover:bg-muted"
                    >
                      <span className="font-medium text-foreground">{item.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{item.count} products</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Subcategory focus
                </div>
                {subcategoryHighlights.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Select or search within a category to surface subcategory shortcuts.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {subcategoryHighlights.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => handleCategoryShortcut(categoryFilter, item.label)}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-left text-sm transition hover:bg-muted"
                      >
                        <span className="font-medium text-foreground">{item.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{item.count} products</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DetailPanel>
        ) : null}

        {loading ? <LoadingBlock label="Loading product register..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load product register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <DetailPanel
            title="Product rows"
            description="Open the product detail page to review catalog information and downstream usage without breaking existing pricing or subscription dependencies."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No products found"
                description="No product records matched the current filter set."
                action={
                  <Link
                    href="/admin/products/create"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                  >
                    Create Product
                  </Link>
                }
              />
            ) : (
              <DataTableShell>
                <DataTable<ProductRow>
                  rows={rows}
                  columns={columns}
                  onRowClick={(row) => router.push(`/admin/products/${row.id}`)}
                  rowActions={(row) => (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/products/${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Open
                      </Link>
                      <Link
                        href={`/admin/products/${row.id}/edit`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/subscriptions/advance-emi/create?product=${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Use in Subscription
                      </Link>
                    </div>
                  )}
                />
              </DataTableShell>
            )}
          </DetailPanel>
        ) : null}
      </div>
    </PortalPage>
  );
}
