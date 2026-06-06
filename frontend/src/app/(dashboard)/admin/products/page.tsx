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
import { listProducts, type ProductRecord } from "@/services/products";

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
    { status: row.category ? "ASSIGNED" : "PENDING", label: row.category ? "Cataloged" : "Needs Catalog" },
    { status: row.image ? "AVAILABLE" : "NOT_PROVIDED", label: row.image ? "Image Ready" : "No Image" },
    { status: row.sku ? "AVAILABLE" : "PENDING", label: row.sku ? "SKU Ready" : "SKU Pending" },
    { status: row.inventory_ready ? "AVAILABLE" : "PENDING", label: row.inventory_ready ? "Inventory Ready" : "Stock Profile Pending" },
    { status: row.is_emi_enabled !== false ? "AVAILABLE" : "PENDING", label: row.is_emi_enabled !== false ? "Subscription Ready" : "EMI Disabled" },
    { status: row.is_direct_sale_enabled !== false ? "AVAILABLE" : "PENDING", label: row.is_direct_sale_enabled !== false ? "Direct Sale Ready" : "Direct Sale Disabled" },
    { status: row.is_rent_enabled || row.is_lease_enabled ? "AVAILABLE" : "PENDING", label: row.is_rent_enabled || row.is_lease_enabled ? "Rent/Lease Ready" : "Rent/Lease Pending" },
  ];
}

export default function AdminProductsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [subcategoryInput, setSubcategoryInput] = useState("");
  const [filters, setFilters] = useState({ q: "", category: "", subcategory: "" });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const payload = await listProducts({
        q: filters.q || undefined,
        category: filters.category || undefined,
        subcategory: filters.subcategory || undefined,
      });
      setRows(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product register.");
      if (mode === "initial") setRows([]);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, [filters]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ q: queryInput.trim(), category: categoryInput.trim(), subcategory: subcategoryInput.trim() });
  }

  function resetFilters() {
    setQueryInput("");
    setCategoryInput("");
    setSubcategoryInput("");
    setFilters({ q: "", category: "", subcategory: "" });
  }

  const metrics = useMemo(() => {
    const imageCount = rows.filter((row) => Boolean(row.image)).length;
    const inventoryReady = rows.filter((row) => row.inventory_ready).length;
    const cataloged = rows.filter((row) => row.category || row.subcategory).length;
    const subscriptionReady = rows.filter((row) => row.is_active !== false && row.is_emi_enabled !== false && Number(row.base_price || 0) > 0).length;
    return {
      imageCount,
      inventoryReady,
      cataloged,
      subscriptionReady,
      imageCoverage: rows.length ? Math.round((imageCount / rows.length) * 100) : 0,
      visibleBaseValue: rows.reduce((sum, row) => sum + Number(row.base_price || 0), 0),
    };
  }, [rows]);

  const exportRows = useMemo(() => rows.map((row) => ({
    id: row.id,
    name: row.name,
    product_code: row.product_code ?? "",
    sku: row.sku ?? "",
    unit_of_measure: row.unit_of_measure ?? "",
    category: row.category ?? "",
    subcategory: row.subcategory ?? "",
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
        <div className="space-y-1">
          <div className="font-medium text-foreground">{row.name}</div>
          <div className="text-xs text-muted-foreground">{row.product_code || `Product #${row.id}`}</div>
          <div className="text-xs text-muted-foreground">Created {formatDateTime(row.created_at)}</div>
        </div>
      ),
    },
    {
      key: "category",
      title: "Catalog",
      sortable: true,
      render: (row) => (
        <div className="space-y-2">
          <div className="text-sm text-foreground">{label(row.category, "Uncategorized")}</div>
          <ERPStatusBadge status={row.subcategory ? "ASSIGNED" : "NOT_PROVIDED"} label={label(row.subcategory, "No subcategory")} hideIcon={!row.subcategory} />
        </div>
      ),
    },
    {
      key: "sku",
      title: "SKU / Unit",
      sortable: true,
      render: (row) => <div className="space-y-1 text-sm text-foreground"><div>{row.sku || "SKU pending"}</div><div className="text-xs text-muted-foreground">{row.unit_of_measure || "PCS"}</div></div>,
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
      key: "readiness",
      title: "Readiness",
      render: (row) => <div className="flex max-w-lg flex-wrap gap-2">{readinessBadges(row).map((badge) => <ERPStatusBadge key={`${row.id}-${badge.label}`} status={badge.status} label={badge.label} />)}</div>,
    },
  ], []);

  return (
    <ERPPageShell
      title="Product Register"
      subtitle="Quickly edit product master fields and prepare inventory profiles without changing historical contracts, invoices, receipts, payments, or subscription pricing snapshots."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Products" }]}
      actions={[{ href: "/admin/products/create", label: "Create Product", variant: "primary" }, { href: "/admin/products/masters", label: "Manage Masters", variant: "secondary" }, { href: "/admin/subscriptions/advance-emi/create", label: "Create Subscription", variant: "secondary" }]}
      stats={[{ label: "Visible Products", value: rows.length }, { label: "Inventory Ready", value: metrics.inventoryReady, tone: metrics.inventoryReady ? "success" : "warning" }, { label: "Subscription Ready", value: metrics.subscriptionReady, tone: "success" }, { label: "Image Coverage", value: `${metrics.imageCoverage}%`, tone: metrics.imageCoverage < 60 ? "warning" : "success" }]}
      statusBadge={{ label: "Operational Register", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPMetricStrip metrics={[{ label: "Visible Products", value: rows.length }, { label: "Visible Base Value", value: money(metrics.visibleBaseValue), detail: "Base price remains product contract total." }, { label: "Cataloged", value: metrics.cataloged, detail: `${rows.length - metrics.cataloged} need catalog cleanup` }, { label: "Inventory Ready", value: metrics.inventoryReady, detail: `${rows.length - metrics.inventoryReady} pending profile preparation` }]} />

        <ERPSectionShell title="Operational shortcuts" description="Use quick edit and inventory prepare actions from each row. Full edit remains available for image and detailed master cleanup.">
          <ERPDataToolbar
            left={
              <form onSubmit={applyFilters} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="text" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search name, code, SKU" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring" /></label>
                <input value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} placeholder="Category" className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring" />
                <input value={subcategoryInput} onChange={(event) => setSubcategoryInput(event.target.value)} placeholder="Subcategory" className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring" />
                <div className="flex flex-wrap gap-2"><button type="submit" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95">Apply</button><button type="button" onClick={resetFilters} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted">Reset</button></div>
              </form>
            }
            right={
              <>
                <Link href="/admin/products/masters" className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted">Manage Masters</Link>
                <button type="button" onClick={() => void loadPage("refresh")} disabled={refreshing || loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"><RefreshCw className="h-4 w-4" />{refreshing ? "Refreshing..." : "Refresh"}</button>
                <button type="button" disabled={!exportRows.length || loading} onClick={() => downloadCsv("product-register-current-view.csv", [{ key: "id", header: "id" }, { key: "name", header: "name" }, { key: "product_code", header: "product_code" }, { key: "sku", header: "sku" }, { key: "unit_of_measure", header: "unit_of_measure" }, { key: "category", header: "category" }, { key: "subcategory", header: "subcategory" }, { key: "base_price", header: "base_price" }, { key: "inventory_ready", header: "inventory_ready" }, { key: "image_status", header: "image_status" }, { key: "created_at", header: "created_at" }], exportRows)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"><Download className="h-4 w-4" />Export</button>
              </>
            }
          />
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Safe edit boundary: product master changes affect future onboarding and billing only. Existing contracts keep saved price/plan snapshots.</div>
        </ERPSectionShell>

        {loading ? <ERPLoadingState label="Loading product register..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load product register" description={error} onRetry={() => void loadPage("initial")} /> : null}

        {!loading && !error ? (
          <ERPSectionShell title="Product rows" description="Quick actions are available on every row and also work on mobile/tablet without hover.">
            {rows.length === 0 ? <ERPEmptyState title="No products found" description="No product records matched the current filter set." action={<Link href="/admin/products/create" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95">Create Product</Link>} /> : (
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
