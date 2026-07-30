"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Layers, Box, Wrench, Shapes, RefreshCw, ExternalLink, Hash } from "lucide-react";

import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { formatRupee } from "@/lib/utils/currency";

import {
  createProductCategoryMaster,
  createProductSubcategoryMaster,
  createProductUnitMaster,
  getProductCatalogOptions,
  listProductRegister,
  type ProductCatalogOptions,
  type ProductRecord,
} from "@/services/products";

import { pimService, type PimCategory } from "@/services/pim";
import { listManufacturingBoms, type ManufacturingBom } from "@/services/manufacturing";

const EMPTY_CATALOG_OPTIONS: ProductCatalogOptions = {
  categories: [],
  subcategories: [],
  unit_of_measure_masters: [],
  unit_of_measure_options: ["PCS"],
  item_type_choices: [],
  stock_type_choices: [],
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

const DATA_TYPE_LABELS: Record<string, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DECIMAL: "Decimal",
  CHOICE: "Choice",
  MULTI_CHOICE: "Multi Choice",
  BOOLEAN: "Yes/No",
  DATE: "Date",
};

const DATA_TYPE_COLORS: Record<string, string> = {
  TEXT: "bg-gray-100 text-gray-700",
  NUMBER: "bg-blue-50 text-blue-700",
  DECIMAL: "bg-blue-50 text-blue-700",
  CHOICE: "bg-purple-50 text-purple-700",
  MULTI_CHOICE: "bg-purple-50 text-purple-700",
  BOOLEAN: "bg-orange-50 text-orange-700",
  DATE: "bg-green-50 text-green-700",
};

function CatalogTab({ catalogOptions, loadPage, saving, setSaving, error, setError, message, setMessage }: any) {
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [subcategoryCategoryId, setSubcategoryCategoryId] = useState("");
  const [subcategoryName, setSubcategoryName] = useState("");
  const [subcategoryDescription, setSubcategoryDescription] = useState("");
  const [unitCode, setUnitCode] = useState("PCS");
  const [unitName, setUnitName] = useState("Pieces");
  const [unitDescription, setUnitDescription] = useState("");

  const subcategoryRows = useMemo(
    () => [...catalogOptions.subcategories].sort((a: any, b: any) => a.category_name.localeCompare(b.category_name) || a.name.localeCompare(b.name)),
    [catalogOptions.subcategories]
  );

  async function handleCreateCategory() {
    if (!categoryName.trim()) return;
    setSaving("category");
    setError(null);
    setMessage(null);
    try {
      await createProductCategoryMaster({ name: categoryName.trim(), description: categoryDescription.trim() || undefined, is_active: true });
      setCategoryName(""); setCategoryDescription(""); setMessage("Category master created.");
      await loadPage("refresh");
    } catch (err) { setError(toErrorMessage(err)); } finally { setSaving(null); }
  }

  async function handleCreateSubcategory() {
    if (!subcategoryCategoryId || !subcategoryName.trim()) return;
    setSaving("subcategory");
    setError(null);
    setMessage(null);
    try {
      await createProductSubcategoryMaster({ category: Number(subcategoryCategoryId), name: subcategoryName.trim(), description: subcategoryDescription.trim() || undefined, is_active: true });
      setSubcategoryName(""); setSubcategoryDescription(""); setMessage("Subcategory master created.");
      await loadPage("refresh");
    } catch (err) { setError(toErrorMessage(err)); } finally { setSaving(null); }
  }

  async function handleCreateUnit() {
    if (!unitCode.trim() || !unitName.trim()) return;
    setSaving("unit");
    setError(null);
    setMessage(null);
    try {
      await createProductUnitMaster({ code: unitCode.trim().toUpperCase(), name: unitName.trim(), description: unitDescription.trim() || undefined, is_active: true });
      setUnitCode("PCS"); setUnitName("Pieces"); setUnitDescription(""); setMessage("Unit master created.");
      await loadPage("refresh");
    } catch (err) { setError(toErrorMessage(err)); } finally { setSaving(null); }
  }

  return (
    <>
      <ERPSectionShell title="Master-data rule" description="Categories, subcategories, and units are shared catalog masters. Product code and SKU stay at the individual product level.">
        <ERPDetailGrid columns={4} items={[
          { label: "Category Owner", value: "Shared product master" },
          { label: "Subcategory Owner", value: "Shared product master" },
          { label: "Unit Owner", value: "Shared product master" },
          { label: "SKU / Code", value: "Managed per product record" },
        ]} />
      </ERPSectionShell>

      <div className="grid gap-6 xl:grid-cols-3">
        <ERPSectionShell title="Categories" description="Create reusable top-level catalog groups.">
          <div className="space-y-4">
            <input type="text" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Category name" disabled={saving !== null} className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring" />
            <textarea value={categoryDescription} onChange={(e) => setCategoryDescription(e.target.value)} placeholder="Description (optional)" rows={3} disabled={saving !== null} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring" />
            <button type="button" onClick={() => void handleCreateCategory()} disabled={saving !== null || !categoryName.trim()} className="inline-flex h-10 items-center justify-center rounded-xl bg-background border border-border px-4 text-sm font-medium hover:bg-muted">
              {saving === "category" ? "Saving..." : "Add Category"}
            </button>
            <div className="space-y-2">
              {catalogOptions.categories.map((row: any) => (
                <div key={row.id} className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                  <div className="font-medium">{row.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.description?.trim() || "No description"}</div>
                </div>
              ))}
            </div>
          </div>
        </ERPSectionShell>

        <ERPSectionShell title="Subcategories" description="Subcategories stay attached to one category.">
          <div className="space-y-4">
            <select value={subcategoryCategoryId} onChange={(e) => setSubcategoryCategoryId(e.target.value)} disabled={saving !== null} className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring">
              <option value="">Select category</option>
              {catalogOptions.categories.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
            <input type="text" value={subcategoryName} onChange={(e) => setSubcategoryName(e.target.value)} placeholder="Subcategory name" disabled={saving !== null} className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring" />
            <textarea value={subcategoryDescription} onChange={(e) => setSubcategoryDescription(e.target.value)} placeholder="Description (optional)" rows={3} disabled={saving !== null} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring" />
            <button type="button" onClick={() => void handleCreateSubcategory()} disabled={saving !== null || !subcategoryCategoryId || !subcategoryName.trim()} className="inline-flex h-10 items-center justify-center rounded-xl bg-background border border-border px-4 text-sm font-medium hover:bg-muted">
              {saving === "subcategory" ? "Saving..." : "Add Subcategory"}
            </button>
            <div className="space-y-2">
              {subcategoryRows.map((row: any) => (
                <div key={row.id} className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                  <div className="font-medium">{row.category_name} · {row.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.description?.trim() || "No description"}</div>
                </div>
              ))}
            </div>
          </div>
        </ERPSectionShell>

        <ERPSectionShell title="Units of measure" description="Manage approved UOM codes.">
          <div className="space-y-4">
            <input type="text" value={unitCode} onChange={(e) => setUnitCode(e.target.value.toUpperCase())} placeholder="Code" disabled={saving !== null} className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm uppercase outline-none transition focus:border-ring" />
            <input type="text" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Display name" disabled={saving !== null} className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring" />
            <textarea value={unitDescription} onChange={(e) => setUnitDescription(e.target.value)} placeholder="Description (optional)" rows={3} disabled={saving !== null} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring" />
            <button type="button" onClick={() => void handleCreateUnit()} disabled={saving !== null || !unitCode.trim() || !unitName.trim()} className="inline-flex h-10 items-center justify-center rounded-xl bg-background border border-border px-4 text-sm font-medium hover:bg-muted">
              {saving === "unit" ? "Saving..." : "Add Unit"}
            </button>
            <div className="space-y-2">
              {catalogOptions.unit_of_measure_masters.map((row: any) => (
                <div key={row.id} className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                  <div className="font-medium">{row.code} · {row.name}</div>
                </div>
              ))}
            </div>
          </div>
        </ERPSectionShell>
      </div>
    </>
  );
}

function PimTab() {
  const [categories, setCategories] = useState<PimCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pimService.getCategories().then(res => setCategories(Array.isArray(res) ? res : [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState label="Loading PIM categories..." />;

  return (
    <div className="space-y-6">
      <ERPSectionShell title="PIM Categories & Attributes" description="Define structured attributes for variants and catalog specs.">
        <div className="flex justify-end mb-4">
          <Link href="/admin/pim/categories" className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">
            Manage PIM Categories →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map(category => (
            <div key={category.id} className="rounded-xl border border-border p-4 bg-background">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium flex items-center gap-2"><span className="text-xl">{category.icon}</span> {category.name}</div>
              </div>
              <div className="text-xs text-muted-foreground mb-4">{category.subcategories.length} Subcategories · {category.attributes.length} Base Attributes</div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {category.attributes.map(attr => (
                   <div key={attr.id} className="flex items-center gap-2 text-xs border border-border rounded-md p-2 bg-muted/20">
                     <Hash className="h-3 w-3 text-muted-foreground" />
                     <span className="font-medium flex-1 truncate">{attr.name}</span>
                     <span className={`px-1.5 py-0.5 rounded-full ${DATA_TYPE_COLORS[attr.data_type] || "bg-muted"}`}>{DATA_TYPE_LABELS[attr.data_type] || attr.data_type}</span>
                     {attr.is_variant_defining && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Variant</span>}
                   </div>
                ))}
              </div>
            </div>
          ))}
          {categories.length === 0 && <div className="col-span-2 text-center text-sm text-muted-foreground p-8">No PIM categories found.</div>}
        </div>
      </ERPSectionShell>
    </div>
  );
}

function BomTab() {
  const [boms, setBoms] = useState<ManufacturingBom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listManufacturingBoms().then(res => setBoms(res.results)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState label="Loading BOMs..." />;

  return (
    <div className="space-y-6">
      <ERPSectionShell title="Bill of Materials" description="Manufacturing structures mapping finished goods to raw materials.">
        <div className="flex justify-end mb-4">
          <Link href="/admin/manufacturing/boms" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Manage BOMs
          </Link>
        </div>
        <div className="rounded-xl border border-border overflow-x-auto bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">BOM No</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Finished Good</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Revision</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {boms.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No BOMs found.</td></tr>
              ) : boms.map(bom => (
                <tr key={bom.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{bom.bom_no}</td>
                  <td className="px-4 py-3 font-medium">{bom.finished_good_product_name || `Item #${bom.finished_good_inventory_item}`}</td>
                  <td className="px-4 py-3 text-center">{bom.revision_no}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bom.status === "ACTIVE" ? "bg-green-50 text-green-700 border border-green-200" : "bg-muted text-muted-foreground border border-border"}`}>
                      {bom.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href="/admin/manufacturing/boms" className="text-primary text-xs hover:underline inline-flex items-center gap-1">
                      View <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ERPSectionShell>
    </div>
  );
}

function MaterialsTab() {
  const [materials, setMaterials] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listProductRegister({ item_type: "RAW_MATERIAL", page_size: 20 }),
      listProductRegister({ item_type: "FINISHED_GOOD", page_size: 20 })
    ]).then(([rawRes, fgRes]) => {
      setMaterials([...rawRes.results, ...fgRes.results].sort((a, b) => b.id - a.id));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState label="Loading Materials..." />;

  return (
    <div className="space-y-6">
      <ERPSectionShell title="Raw Materials & Finished Goods" description="Quick view of physical items in the product register.">
        <div className="flex justify-end gap-2 mb-4">
          <Link href="/admin/products/create" className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
            Create Product
          </Link>
        </div>
        <div className="rounded-xl border border-border overflow-x-auto bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Base Price</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">PIM Sync</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {materials.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No items found.</td></tr>
              ) : materials.map(item => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.product_code || item.id}</td>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${item.item_type === "FINISHED_GOOD" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                      {item.item_type === "FINISHED_GOOD" ? "Finished Good" : "Raw Material"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRupee(item.base_price || "0")}</td>
                  <td className="px-4 py-3 text-center">
                    {item.item_type === "FINISHED_GOOD" ? (
                      <span className="text-xs text-muted-foreground">Ready</span>
                    ) : (
                      <span className="text-xs text-muted-foreground opacity-50">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/products/${item.id}/edit`} className="text-primary text-xs hover:underline inline-flex items-center gap-1">
                      Edit <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ERPSectionShell>
    </div>
  );
}

export default function AdminProductMastersPage() {
  const [currentTab, setCurrentTab] = useState<"catalog" | "pim" | "bom" | "materials">("catalog");
  const [catalogOptions, setCatalogOptions] = useState<ProductCatalogOptions>(EMPTY_CATALOG_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<null | "category" | "subcategory" | "unit">(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const payload = await getProductCatalogOptions();
      setCatalogOptions(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") setCatalogOptions(EMPTY_CATALOG_OPTIONS);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const tabs = [
    { id: "catalog", label: "Catalog Masters", icon: <Layers className="h-4 w-4" /> },
    { id: "pim", label: "PIM Definitions", icon: <Shapes className="h-4 w-4" /> },
    { id: "bom", label: "BOM Masters", icon: <Wrench className="h-4 w-4" /> },
    { id: "materials", label: "Materials & Goods", icon: <Box className="h-4 w-4" /> },
  ] as const;

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Unified Product Masters"
      subtitle="Govern shared catalog masters, PIM attributes, BOMs, and materials from one central hub."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Products", href: "/admin/products" },
        { label: "Masters" },
      ]}
      actions={[
        { href: "/admin/products", label: "Back to Register", variant: "secondary" },
        { href: "/admin/products/create", label: "Create Product", variant: "primary" },
      ]}
      statusBadge={{ label: "Data Governance", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPDataToolbar
          left={
            <div className="flex gap-1 bg-muted/40 p-1 rounded-xl border border-border overflow-x-auto w-full max-w-full">
              {tabs.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCurrentTab(t.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${currentTab === t.id ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          }
          right={
            <button type="button" onClick={() => void loadPage("refresh")} disabled={refreshing || loading} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition hover:bg-muted disabled:opacity-60 shrink-0">
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
          }
        />

        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
        {error && <ERPErrorState title="Error" description={error} onRetry={() => void loadPage("initial")} />}

        {loading ? (
          <ERPLoadingState label="Loading masters hub..." />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {currentTab === "catalog" && (
              <CatalogTab catalogOptions={catalogOptions} loadPage={loadPage} saving={saving} setSaving={setSaving} error={error} setError={setError} message={message} setMessage={setMessage} />
            )}
            {currentTab === "pim" && <PimTab />}
            {currentTab === "bom" && <BomTab />}
            {currentTab === "materials" && <MaterialsTab />}
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
