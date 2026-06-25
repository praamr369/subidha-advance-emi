"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import {
  createProductCategoryMaster,
  createProductSubcategoryMaster,
  createProductUnitMaster,
  getProductCatalogOptions,
  type ProductCatalogOptions,
} from "@/services/products";

const EMPTY_CATALOG_OPTIONS: ProductCatalogOptions = {
  categories: [],
  subcategories: [],
  unit_of_measure_masters: [],
  unit_of_measure_options: ["PCS"],
};

function toErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unable to complete product master action.";
  const raw = error.message.trim();
  if (!raw) return "Unable to complete product master action.";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
    for (const [field, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) return `${field}: ${String(value[0])}`;
      if (typeof value === "string" && value.trim()) return `${field}: ${value}`;
    }
  } catch {
    return raw;
  }
  return raw;
}

export default function AdminProductMastersPage() {
  const [catalogOptions, setCatalogOptions] = useState<ProductCatalogOptions>(EMPTY_CATALOG_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<null | "category" | "subcategory" | "unit">(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [subcategoryCategoryId, setSubcategoryCategoryId] = useState("");
  const [subcategoryName, setSubcategoryName] = useState("");
  const [subcategoryDescription, setSubcategoryDescription] = useState("");
  const [unitCode, setUnitCode] = useState("PCS");
  const [unitName, setUnitName] = useState("Pieces");
  const [unitDescription, setUnitDescription] = useState("");

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const payload = await getProductCatalogOptions();
      setCatalogOptions(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setCatalogOptions(EMPTY_CATALOG_OPTIONS);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const subcategoryRows = useMemo(
    () => [...catalogOptions.subcategories].sort((a, b) => a.category_name.localeCompare(b.category_name) || a.name.localeCompare(b.name)),
    [catalogOptions.subcategories]
  );

  async function handleCreateCategory() {
    if (!categoryName.trim()) return;
    setSaving("category");
    setError(null);
    setMessage(null);
    try {
      await createProductCategoryMaster({
        name: categoryName.trim(),
        description: categoryDescription.trim() || undefined,
        is_active: true,
      });
      setCategoryName("");
      setCategoryDescription("");
      setMessage("Category master created.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function handleCreateSubcategory() {
    if (!subcategoryCategoryId || !subcategoryName.trim()) return;
    setSaving("subcategory");
    setError(null);
    setMessage(null);
    try {
      await createProductSubcategoryMaster({
        category: Number(subcategoryCategoryId),
        name: subcategoryName.trim(),
        description: subcategoryDescription.trim() || undefined,
        is_active: true,
      });
      setSubcategoryName("");
      setSubcategoryDescription("");
      setMessage("Subcategory master created.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function handleCreateUnit() {
    if (!unitCode.trim() || !unitName.trim()) return;
    setSaving("unit");
    setError(null);
    setMessage(null);
    try {
      await createProductUnitMaster({
        code: unitCode.trim().toUpperCase(),
        name: unitName.trim(),
        description: unitDescription.trim() || undefined,
        is_active: true,
      });
      setUnitCode("PCS");
      setUnitName("Pieces");
      setUnitDescription("");
      setMessage("Unit master created.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Product Masters"
      subtitle="Govern shared catalog masters for category, subcategory, and unit of measure from the product workspace. SKU and product code remain product-level identifiers."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Products", href: "/admin/products" },
        { label: "Masters" },
      ]}
      actions={[
        { href: "/admin/products", label: "Back to Product Register", variant: "secondary" },
        { href: "/admin/products/create", label: "Create Product", variant: "primary" },
      ]}
      stats={[
        { label: "Categories", value: catalogOptions.categories.length },
        { label: "Subcategories", value: catalogOptions.subcategories.length },
        { label: "Units", value: catalogOptions.unit_of_measure_masters.length },
        { label: "Default UOM", value: catalogOptions.unit_of_measure_options[0] || "PCS" },
      ]}
      statusBadge={{ label: "Catalog Governance", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPDataToolbar
          right={
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading || saving !== null}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          }
        />

        {loading ? <ERPLoadingState label="Loading product masters..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load product masters"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            {message ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {message}
              </div>
            ) : null}

            <ERPSectionShell
              title="Master-data rule"
              description="Categories, subcategories, and units are shared catalog masters. Product code and SKU stay at the individual product level so catalog identity does not split into conflicting truths."
            >
              <ERPDetailGrid
                columns={4}
                items={[
                  { label: "Category Owner", value: "Shared product master" },
                  { label: "Subcategory Owner", value: "Shared product master" },
                  { label: "Unit Owner", value: "Shared product master" },
                  { label: "SKU / Code", value: "Managed per product record" },
                ]}
              />
            </ERPSectionShell>

            <div className="grid gap-6 xl:grid-cols-3">
              <ERPSectionShell
                title="Categories"
                description="Create reusable top-level catalog groups before adding products."
              >
                <div className="space-y-4">
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    placeholder="Category name"
                    disabled={saving !== null}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <textarea
                    value={categoryDescription}
                    onChange={(event) => setCategoryDescription(event.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                    disabled={saving !== null}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateCategory()}
                    disabled={saving !== null || !categoryName.trim()}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving === "category" ? "Saving..." : "Add Category"}
                  </button>
                  <div className="space-y-2">
                    {catalogOptions.categories.map((row) => (
                      <div key={row.id} className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
                        <div className="font-medium">{row.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.description?.trim() || "No description"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </ERPSectionShell>

              <ERPSectionShell
                title="Subcategories"
                description="Subcategories stay attached to one category so operators do not create ambiguous catalog branches."
              >
                <div className="space-y-4">
                  <select
                    value={subcategoryCategoryId}
                    onChange={(event) => setSubcategoryCategoryId(event.target.value)}
                    disabled={saving !== null}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Select category</option>
                    {catalogOptions.categories.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={subcategoryName}
                    onChange={(event) => setSubcategoryName(event.target.value)}
                    placeholder="Subcategory name"
                    disabled={saving !== null}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <textarea
                    value={subcategoryDescription}
                    onChange={(event) => setSubcategoryDescription(event.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                    disabled={saving !== null}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateSubcategory()}
                    disabled={saving !== null || !subcategoryCategoryId || !subcategoryName.trim()}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving === "subcategory" ? "Saving..." : "Add Subcategory"}
                  </button>
                  <div className="space-y-2">
                    {subcategoryRows.map((row) => (
                      <div key={row.id} className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
                        <div className="font-medium">{row.category_name} · {row.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.description?.trim() || "No description"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </ERPSectionShell>

              <ERPSectionShell
                title="Units of measure"
                description="Manage approved UOM codes once, then reuse them across products and future stock records."
              >
                <div className="space-y-4">
                  <input
                    type="text"
                    value={unitCode}
                    onChange={(event) => setUnitCode(event.target.value.toUpperCase())}
                    placeholder="Code"
                    disabled={saving !== null}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm uppercase outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <input
                    type="text"
                    value={unitName}
                    onChange={(event) => setUnitName(event.target.value)}
                    placeholder="Display name"
                    disabled={saving !== null}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <textarea
                    value={unitDescription}
                    onChange={(event) => setUnitDescription(event.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                    disabled={saving !== null}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateUnit()}
                    disabled={saving !== null || !unitCode.trim() || !unitName.trim()}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving === "unit" ? "Saving..." : "Add Unit"}
                  </button>
                  <div className="space-y-2">
                    {catalogOptions.unit_of_measure_masters.map((row) => (
                      <div key={row.id} className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
                        <div className="font-medium">{row.code} · {row.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </ERPSectionShell>
            </div>

            <ERPSectionShell
              title="Operator workflow"
              description="Keep catalog maintenance fast and duplication-safe for daily shop use."
            >
              <ERPDetailGrid
                columns={4}
                items={[
                  { label: "1. Add masters", value: "Category, subcategory, UOM" },
                  { label: "2. Create product", value: "Assign code, SKU, price, modes" },
                  { label: "3. Prepare inventory", value: "Only for stock-tracked items" },
                  { label: "4. Import safely", value: "CSV extends masters, never rewrites EMI truth" },
                ]}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/admin/products/create"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Create Product
                </Link>
                <Link
                  href="/admin/products/import"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Import Products
                </Link>
              </div>
            </ERPSectionShell>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
