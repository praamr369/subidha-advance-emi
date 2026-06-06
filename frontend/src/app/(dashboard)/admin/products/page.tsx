"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, RefreshCw, Search } from "lucide-react";

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
import { listProductRegister, type ProductRecord, type ProductRegisterPage } from "@/services/products";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString();
}

function label(value: string | null | undefined, fallback: string): string {
  const text = (value || "").trim();
  return text || fallback;
}

function truncate(value: string | null | undefined, length = 90): string {
  const text = (value || "").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text || "—";
}

function readinessBadges(row: ProductRecord) {
  return [
    { status: row.category || row.category_master_name ? "ASSIGNED" : "PENDING", label: row.category || row.category_master_name ? "Cataloged" : "Catalog Cleanup" },
    { status: row.image ? "AVAILABLE" : "NOT_PROVIDED", label: row.image ? "Image Ready" : "No Image" },
    { status: row.sku ? "AVAILABLE" : "PENDING", label: row.sku ? "SKU Ready" : "SKU Pending" },
    { status: row.inventory_ready ? "AVAILABLE" : "PENDING", label: row.inventory_ready ? "Inventory Ready" : "Stock Profile Pending" },
    { status: row.is_emi_enabled !== false && Number(row.base_price || 0) > 0 ? "AVAILABLE" : "PENDING", label: row.is_emi_enabled !== false ? "Subscription Ready" : "EMI Disabled" },
    { status: row.is_direct_sale_enabled !== false ? "AVAILABLE" : "PENDING", label: row.is_direct_sale_enabled !== false ? "Direct Sale Ready" : "Direct Sale Disabled" },
    { status: row.is_rent_enabled || row.is_lease_enabled ? "AVAILABLE" : "PENDING", label: row.is_rent_enabled || row.is_lease_enabled ? "Rent/Lease Ready" : "Rent/Lease Pending" },
  ];
}

function emptyPage(): ProductRegisterPage {
  return {
    count: 0,
    total_count: 0,
    catalog_total_count: 0,
    page: 1,
    page_size: 50,
    page_size_options: PAGE_SIZE_OPTIONS,
    num_pages: 0,
    has_next: false,
    has_previous: false,
    range_start: 0,
    range_end: 0,
    summary: {
      total_products: 0,
      inventory_ready: 0,
      stock_profile_pending: 0,
      subscription_ready: 0,
      direct_sale_ready: 0,
      rent_lease_ready: 0,
      image_missing: 0,
      catalog_cleanup_required: 0,
      total_base_value: "0.00",
    },
    results: [],
  };
}

export default function AdminProductsPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<ProductRegisterPage>(() => emptyPage());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [subcategoryInput, setSubcategoryInput] = useState("");
  const [filters, setFilters] = useState({ q: "", category: "", subcategory: "", readiness: "", capability: "", active: "", inventory: "", image_status: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const rows = payload.results;
  const summary = payload.summary;

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const nextPayload = await listProductRegister({
        q: filters.q || undefined,
        category: filters.category || undefined,
        subcategory: filters.subcategory || undefined,
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
  }

  useEffect(() => {
    void loadPage("initial");
  }, [filters, page, pageSize]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters((current) => ({ ...current, q: queryInput.trim(), category: categoryInput.trim(), subcategory: subcategoryInput.trim() }));
  }

  function resetFilters() {
    setQueryInput("");
    setCategoryInput("");
    setSubcategoryInput("");
    setPage(1);
    setFilters({ q: "", category: "", subcategory: "", readiness: "", capability: "", active: "", inventory: "", image_status: "" });
  }

  function changeFilter(key: keyof typeof filters, value: string) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const exportRows = useMemo(() => rows.map((row) => ({
    id: row.id,
    name: row.name,
    product_code: row.product_code ?? "",
    sku: row.sku ?? "",
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
      render: (row) => <div className="space-y-1"><div className="font-medium text-foreground">{row.name}</div><div className="text-xs text-muted-foreground">{row.product_code || `Product #${row.id}`}</div><div className="text-xs text-muted-foreground">SKU {row.sku || "pending"}</div><div className="text-xs text-muted-foreground">Created {formatDateTime(row.created_at)}</div></div>,
    },
    {
      key: "category",
      title: "Catalog",
      sortable: true,
      render: (row) => <div className="space-y-2"><div className="text-sm text-foreground">{label(row.category || row.category_master_name, "Uncategorized")}</div><ERPStatusBadge status={row.subcategory || row.subcategory_master_name ? "ASSIGNED" : "NOT_PROVIDED"} label={label(row.subcategory || row.subcategory_master_name, "No subcategory")} hideIcon={!(row.subcategory || row.subcategory_master_name)} /><div className="text-xs text-muted-foreground">Unit {row.unit_of_measure || row.unit_of_measure_master_name || "PCS"}</div></div>,
    },
    {
      key: "description",
      title: "Description",
      render: (row) => <div className="max-w-md text-sm text-foreground">{truncate(row.description)}</div>,
    },
    {
      key: "base_price",
      title: "Base Price",
      align: "right",
      sortable: true,
      sortAccessor: (row) => Number(row.base_price || 0),
      render: (row) => <div className="space-y-1 text-right"><div className="font-semibold text-foreground">{money(row.base_price)}</div><div className="text-xs text-muted-foreground">Future contracts only</div></div>,
    },
    {
      key: "capabilities",
      title: "Capabilities",
      render: (row) => <div className="flex max-w-xs flex-wrap gap-2"><ERPStatusBadge status={row.is_emi_enabled !== false ? "AVAILABLE" : "PENDING"} label="EMI" /><ERPStatusBadge status={row.is_rent_enabled ? "AVAILABLE" : "PENDING"} label="Rent" /><ERPStatusBadge status={row.is_lease_enabled ? "AVAILABLE" : "PENDING"} label="Lease" /><ERPStatusBadge status={row.is_direct_sale_enabled !== false ? "AVAILABLE" : "PENDING"} label="Direct Sale" /></div>,
    },
    {
      key: "readiness",
      title: "Readiness",
      render: (row) => <div className="flex max-w-lg flex-wrap gap-2">{readinessBadges(row).map((badge) => <ERPStatusBadge key={`${row.id}-${badge.label}`} status={badge.status} label={badge.label} />)}</div>,
    },
  ], []);

  const rangeText = payload.count ? `${payload.range_start}–${payload.range_end} of ${payload.count}` : "0 products";

  return (
    <ERPPageShell
      title="Product Register"
      subtitle="Enterprise product operations register with server-side pagination, full-catalog search, quick edits, and inventory preparation. Product edits affect future onboarding only."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Products" }]}
      actions={[{ href: "/admin/products/create", label: "Create Product", variant: "primary" }, { href: "/admin/products/masters", label: "Manage Masters", variant: "secondary" }, { href: "/admin/subscriptions/advance-emi/create", label: "Create Subscription", variant: "secondary" }]}
      stats={[{ label: "Total Products", value: payload.catalog_total_count || payload.count }, { label: "Filtered", value: payload.count }, { label: "Inventory Ready", value: summary.inventory_ready, tone: summary.inventory_ready ? "success" : "warning" }, { label: "Image Missing", value: summary.image_missing, tone: summary.image_missing ? "warning" : "success" }]}
      statusBadge={{ label: "Admin Workspace", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPMetricStrip metrics={[{ label: "Total products", value: payload.catalog_total_count || payload.count, detail: `${rangeText} visible on this page` }, { label: "Total base value", value: money(summary.total_base_value), detail: "Filtered product master value" }, { label: "Inventory ready", value: summary.inventory_ready, detail: `${summary.stock_profile_pending} pending stock profile` }, { label: "Subscription ready", value: summary.subscription_ready, detail: "Future onboarding readiness" }, { label: "Image missing", value: summary.image_missing, detail: "Catalog cleanup required" }, { label: "Catalog cleanup", value: summary.catalog_cleanup_required, detail: "Missing category/subcategory" }]} />

        <ERPSectionShell title="Register toolbar" description="Search and filters run on the full product dataset, not only the visible page.">
          <ERPDataToolbar
            left={
              <form onSubmit={applyFilters} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_150px_150px_150px_150px_150px_auto]">
                <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="text" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search name, code, SKU" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring" /></label>
                <input value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} placeholder="Category" className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring" />
                <input value={subcategoryInput} onChange={(event) => setSubcategoryInput(event.target.value)} placeholder="Subcategory" className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring" />
                <select value={filters.readiness} onChange={(event) => changeFilter("readiness", event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="">All readiness</option><option value="INVENTORY_READY">Inventory Ready</option><option value="STOCK_PROFILE_PENDING">Stock Profile Pending</option><option value="NO_IMAGE">No Image</option><option value="SKU_PENDING">SKU Pending</option><option value="CATALOG_CLEANUP">Catalog Cleanup</option><option value="SUBSCRIPTION_READY">Subscription Ready</option><option value="DIRECT_SALE_READY">Direct Sale Ready</option><option value="RENT_LEASE_READY">Rent/Lease Ready</option></select>
                <select value={filters.capability} onChange={(event) => changeFilter("capability", event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="">All capabilities</option><option value="EMI">EMI</option><option value="RENT">Rent</option><option value="LEASE">Lease</option><option value="DIRECT_SALE">Direct Sale</option></select>
                <select value={filters.active} onChange={(event) => changeFilter("active", event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="">All status</option><option value="true">Active</option><option value="false">Inactive</option></select>
                <div className="flex flex-wrap gap-2"><button type="submit" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95">Apply</button><button type="button" onClick={resetFilters} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted">Reset</button></div>
              </form>
            }
            right={
              <>
                <select value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value={20}>20 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select>
                <Link href="/admin/products/masters" className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted">Manage Masters</Link>
                <button type="button" onClick={() => void loadPage("refresh")} disabled={refreshing || loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"><RefreshCw className="h-4 w-4" />{refreshing ? "Refreshing..." : "Refresh"}</button>
                <button type="button" disabled={!exportRows.length || loading} onClick={() => downloadCsv("product-register-current-page.csv", [{ key: "id", header: "id" }, { key: "name", header: "name" }, { key: "product_code", header: "product_code" }, { key: "sku", header: "sku" }, { key: "unit_of_measure", header: "unit_of_measure" }, { key: "category", header: "category" }, { key: "subcategory", header: "subcategory" }, { key: "base_price", header: "base_price" }, { key: "inventory_ready", header: "inventory_ready" }, { key: "image_status", header: "image_status" }, { key: "created_at", header: "created_at" }], exportRows)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"><Download className="h-4 w-4" />Export page</button>
              </>
            }
          />
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Safe edit boundary: product master changes affect future onboarding and billing only. Existing contracts keep saved pricing and plan snapshots.</div>
        </ERPSectionShell>

        {loading ? <ERPLoadingState label="Loading product register..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load product register" description={error} onRetry={() => void loadPage("initial")} /> : null}

        {!loading && !error ? (
          <ERPSectionShell title="Product rows" description={`${rangeText}. Quick actions are available on every row and also work on mobile/tablet without hover.`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <span>{rangeText}</span>
              <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!payload.has_previous || page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))} className="rounded-lg border border-border px-3 py-2 font-semibold text-foreground disabled:opacity-50">Previous</button><span className="px-2">Page {payload.page} of {payload.num_pages || 1}</span><button type="button" disabled={!payload.has_next} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-border px-3 py-2 font-semibold text-foreground disabled:opacity-50">Next</button></div>
            </div>
            {rows.length === 0 ? <ERPEmptyState title="No products found" description="No product records matched the current full-catalog filter set." action={<Link href="/admin/products/create" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95">Create Product</Link>} /> : (
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
      </div>
    </ERPPageShell>
  );
}
